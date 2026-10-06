#!/usr/bin/env python3
"""Build a train tour's track from an OpenStreetMap route relation.

    python3 scripts/osm-route.py 9802494 京都 東京 > route.json      # Nozomi, Kyoto -> Tokyo
    python3 scripts/osm-route.py route.json --at 334.5               # lat/lng 334.5 km along it
    python3 scripts/osm-route.py route.json --km 35.1387,138.6374    # km of a point (and metres off-track)

Downloads the relation from the OSM API, stitches its ways in member order, removes
out-and-back spurs left by mis-ordered ways, crops between two stop names, and writes
{"full": [[lat, lng], ...], "cum": [metres...], "path": simplified [[lat, lng], ...]}.
Put "path" in tour.json; use --at to place each trigger about a minute before its sight.
"""
import json
import math
import sys
import urllib.request


def hav(a, b):
    r = 6371008.8
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def simplify(pts, eps):
    """Douglas-Peucker in local metres."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    k = math.cos(math.radians((a[0] + b[0]) / 2)) * 111320

    def xy(p):
        return p[1] * k, p[0] * 110574

    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1e-9
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        px, py = xy(pts[i])
        d = abs(dy * px - dx * py + bx * ay - by * ax) / length
        if d > best:
            best, bi = d, i
    if best > eps:
        return simplify(pts[: bi + 1], eps)[:-1] + simplify(pts[bi:], eps)
    return [a, b]


def build(relation_id, start, end):
    url = f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full.json"
    req = urllib.request.Request(url, headers={"User-Agent": "walkingtour-route-builder/1.0"})
    data = json.load(urllib.request.urlopen(req, timeout=300))
    nodes = {e["id"]: (e["lat"], e["lon"]) for e in data["elements"] if e["type"] == "node"}
    names = {e["id"]: e.get("tags", {}).get("name") for e in data["elements"] if e["type"] == "node"}
    ways = {e["id"]: e["nodes"] for e in data["elements"] if e["type"] == "way"}
    rel = next(e for e in data["elements"] if e["type"] == "relation" and e["id"] == relation_id)
    seq = [ways[m["ref"]] for m in rel["members"] if m["type"] == "way" and m["role"] == "" and m["ref"] in ways]
    stops = {names[m["ref"]]: nodes[m["ref"]] for m in rel["members"] if m["type"] == "node" and m["ref"] in nodes}

    line = list(seq[0])
    if seq[1][0] == line[0] or seq[1][-1] == line[0]:
        line.reverse()
    for w in seq[1:]:
        if w[0] == line[-1]:
            line += w[1:]
        elif w[-1] == line[-1]:
            line += list(reversed(w))[1:]
        else:  # gap: take the closer end
            a = nodes[line[-1]]
            line += w if math.dist(a, nodes[w[0]]) <= math.dist(a, nodes[w[-1]]) else list(reversed(w))

    # Drop loops: whenever the line returns to a point it already visited, cut the detour.
    out, seen = [], {}
    for p in (nodes[n] for n in line):
        if p in seen:
            for q in out[seen[p] + 1 :]:
                seen.pop(q, None)
            del out[seen[p] + 1 :]
            continue
        seen[p] = len(out)
        out.append(p)

    i0 = min(range(len(out)), key=lambda k: hav(out[k], stops[start]))
    i1 = min(range(len(out)), key=lambda k: hav(out[k], stops[end]))
    full = out[i0 : i1 + 1]
    cum = [0.0]
    for i in range(len(full) - 1):
        cum.append(cum[-1] + hav(full[i], full[i + 1]))
    sys.setrecursionlimit(20000)
    path = [[round(a, 5), round(b, 5)] for a, b in simplify(full, 20)]
    print(f"{start} -> {end}: {cum[-1] / 1000:.1f} km, {len(full)} points, {len(path)} simplified", file=sys.stderr)
    return {"full": full, "cum": cum, "path": path}


def at_km(route, km):
    full, cum, m = route["full"], route["cum"], km * 1000
    for i in range(len(cum) - 1):
        if cum[i + 1] >= m:
            t = (m - cum[i]) / max(cum[i + 1] - cum[i], 1e-9)
            a, b = full[i], full[i + 1]
            return round(a[0] + (b[0] - a[0]) * t, 5), round(a[1] + (b[1] - a[1]) * t, 5)
    return tuple(full[-1])


def km_of(route, p):
    full = route["full"]
    i = min(range(len(full)), key=lambda k: hav(full[k], p))
    return round(route["cum"][i] / 1000, 1), round(hav(full[i], p))


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 3 and args[0].isdigit():
        json.dump(build(int(args[0]), args[1], args[2]), sys.stdout)
    elif len(args) == 3 and args[1] == "--at":
        print(at_km(json.load(open(args[0])), float(args[2])))
    elif len(args) == 3 and args[1] == "--km":
        print(km_of(json.load(open(args[0])), tuple(map(float, args[2].split(",")))))
    else:
        sys.exit(__doc__)
