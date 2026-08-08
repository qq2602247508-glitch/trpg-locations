# Round 16 — parent-terrain compound sites visual audit

## Scope

This round targeted three previously unhandled combinations:

1. A magical scholar city inside a hollow ancient tree.
2. A mangrove smuggler port village.
3. A floating salt-crystal monastery above a cavern tide pool.

The goal was to keep the parent terrain in control while placing independent
BuildingModule interiors on valid support surfaces.

## Baseline failures

- The hollow-tree prompt became a generic forest/city block layout with no tree
  shell, interior cavity, spiral route, root archive or canopy level.
- The mangrove prompt was hijacked by the child word “酒馆” and became a tiny
  standalone inn.
- The salt-monastery prompt produced a flat institutional building with no
  separated floating islands, crystal underside, bridge network or cavern floor.

## Delivered composition primitives

- `hollow-tree-city`: segmented bark shell, root buttresses, four interior
  ring-walk levels, continuous spiral tree street, root archive basement and
  canopy observatory high ground.
- `mangrove-smuggler-port`: tidal channel, root boardwalks, prop-root cover,
  suspended dock, patrol tower and underwater entry portal.
- `salt-crystal-monastery`: three separated salt-crystal island supports at
  0/25/50 ft, exposed undersides, crystal spires, two suspension bridges,
  supported vertical stairs, cavern tide pool and cavern columns.

Buildings remain independently seeded and are placed through the existing
settlement parcel/building module path rather than replaced with decorative
proxies.

## Browser visual evidence

- `hollow-tree-city-final.png`: same Seed `round16-hollow-tree-a`, 98/100,
  semantic coverage 100%, 15 routes, 36 rooms.
- `mangrove-smuggler-port-final.png`: same Seed `round16-mangrove-port-a`,
  97/100, semantic coverage 100%, 18 routes, 36 rooms.
- `salt-crystal-monastery-final.png`: same Seed `round16-salt-monastery-a`,
  96/100, semantic coverage 94%, 10 routes, 29 rooms.
- `salt-crystal-monastery-seed-b.png`: changed Seed regression, 96/100,
  320×260 ft and 514 primitives versus 305×230 ft and 549 primitives for
  seed A; the spatial composition changes while retaining the parent grammar.

## Automated gates

- TypeScript + Vitest: 172/172 passing.
- Production build: passing.
- Same Seed deterministic replay: passing.
- Different Seed structural variation: passing for the salt-crystal site.
- `git diff --check`: passing.

## Remaining quality gaps

- The hollow-tree bark shell is still assembled from repeated vertical bark
  segments instead of a true irregular boolean hollow.
- The mangrove distant silhouette needs a denser canopy layer and a wider,
  more visually dominant tidal channel.
- The salt-crystal site needs stronger crystal material contrast and a closer
  low-angle presentation for the cavern floor.
- The generic composition grammar still reports a 94% semantic score for the
  salt-monastery phrase because the parent-site capability catalog does not yet
  have a dedicated monastery-cluster motif.
