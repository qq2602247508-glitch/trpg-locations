# Regression 25 performance matrix

Node generation time is measured for evidence only; it is not part of deterministic scene content or score.

Cases: 48 (12 themes × 2 sizes × 2 densities).

| label | kind | size | density | bounds | primitives | areaCells | primitiveDensity | semanticYield | rooms | routes | tactical | quality | generationMs | valid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| settlement-harbor | settlement | medium | 0.35 | 70x52 | 4099 | 3640 | 1.1261 | 1.8297 | 29 | 18 | 28 | 100 | 44.19 | PASS |
| settlement-harbor | settlement | medium | 0.82 | 70x58 | 4710 | 4060 | 1.1601 | 1.9745 | 40 | 19 | 34 | 100 | 28.98 | PASS |
| settlement-harbor | settlement | large | 0.35 | 101x79 | 8566 | 7979 | 1.0736 | 1.0273 | 37 | 21 | 30 | 87 | 48.94 | PASS |
| settlement-harbor | settlement | large | 0.82 | 99x74 | 8249 | 7326 | 1.126 | 1.5032 | 55 | 24 | 45 | 100 | 67.16 | PASS |
| settlement-village | settlement | medium | 0.35 | 47x39 | 2141 | 1833 | 1.168 | 2.0551 | 22 | 12 | 10 | 100 | 12.88 | PASS |
| settlement-village | settlement | medium | 0.82 | 49x40 | 2344 | 1960 | 1.1959 | 2.0478 | 25 | 13 | 10 | 100 | 12.25 | PASS |
| settlement-village | settlement | large | 0.35 | 65x59 | 4235 | 3835 | 1.1043 | 1.3223 | 28 | 16 | 12 | 95 | 22.94 | PASS |
| settlement-village | settlement | large | 0.82 | 65x60 | 4413 | 3900 | 1.1315 | 1.4049 | 34 | 16 | 12 | 97 | 24.58 | PASS |
| wilderness-forest | wilderness | medium | 0.35 | 50x46 | 2979 | 2300 | 1.2952 | 1.0742 | 5 | 5 | 22 | 87 | 38.92 | PASS |
| wilderness-forest | wilderness | medium | 0.82 | 54x47 | 3671 | 2538 | 1.4464 | 1.0624 | 5 | 5 | 29 | 88 | 32.45 | PASS |
| wilderness-forest | wilderness | large | 0.35 | 83x68 | 6381 | 5644 | 1.1306 | 0.5015 | 5 | 5 | 22 | 73 | 55.78 | PASS |
| wilderness-forest | wilderness | large | 0.82 | 79x69 | 6868 | 5451 | 1.26 | 0.5679 | 5 | 5 | 29 | 75 | 59.27 | PASS |
| wilderness-rift | wilderness | medium | 0.35 | 49x34 | 143 | 1666 | 0.0858 | 36.3636 | 3 | 5 | 44 | 100 | 8.28 | PASS |
| wilderness-rift | wilderness | medium | 0.82 | 46x39 | 208 | 1794 | 0.1159 | 38.9423 | 3 | 6 | 72 | 100 | 7.28 | PASS |
| wilderness-rift | wilderness | large | 0.35 | 73x56 | 141 | 4088 | 0.0345 | 39.7163 | 3 | 5 | 48 | 100 | 17.15 | PASS |
| wilderness-rift | wilderness | large | 0.82 | 69x55 | 209 | 3795 | 0.0551 | 39.2344 | 3 | 6 | 73 | 100 | 15.77 | PASS |
| cave-crystal | cave | medium | 0.35 | 34x32 | 216 | 1088 | 0.1985 | 15.7407 | 7 | 8 | 19 | 100 | 1.93 | PASS |
| cave-crystal | cave | medium | 0.82 | 36x35 | 157 | 1260 | 0.1246 | 17.1975 | 5 | 6 | 16 | 100 | 0.82 | PASS |
| cave-crystal | cave | large | 0.35 | 49x46 | 240 | 2254 | 0.1065 | 14.5833 | 8 | 9 | 18 | 100 | 1.07 | PASS |
| cave-crystal | cave | large | 0.82 | 43x44 | 226 | 1892 | 0.1195 | 16.3717 | 7 | 8 | 22 | 100 | 0.98 | PASS |
| cave-mine | cave | medium | 0.35 | 38x32 | 153 | 1216 | 0.1258 | 16.9935 | 5 | 6 | 15 | 100 | 0.7 | PASS |
| cave-mine | cave | medium | 0.82 | 35x28 | 182 | 980 | 0.1857 | 18.1319 | 6 | 7 | 20 | 100 | 0.83 | PASS |
| cave-mine | cave | large | 0.35 | 51x37 | 274 | 1887 | 0.1452 | 14.5985 | 8 | 9 | 23 | 100 | 1.21 | PASS |
| cave-mine | cave | large | 0.82 | 51x36 | 218 | 1836 | 0.1187 | 16.055 | 7 | 8 | 20 | 100 | 1.19 | PASS |
| sewer-tidal | sewer | medium | 0.35 | 30x20 | 39 | 600 | 0.065 | 43.5897 | 7 | 4 | 6 | 100 | 1.21 | PASS |
| sewer-tidal | sewer | medium | 0.82 | 29x23 | 39 | 667 | 0.0585 | 43.5897 | 7 | 4 | 6 | 100 | 0.49 | PASS |
| sewer-tidal | sewer | large | 0.35 | 38x28 | 39 | 1064 | 0.0367 | 43.5897 | 7 | 4 | 6 | 100 | 0.41 | PASS |
| sewer-tidal | sewer | large | 0.82 | 32x27 | 39 | 864 | 0.0451 | 43.5897 | 7 | 4 | 6 | 100 | 0.35 | PASS |
| sewer-industrial | sewer | medium | 0.35 | 30x24 | 39 | 720 | 0.0542 | 43.5897 | 7 | 4 | 6 | 100 | 0.35 | PASS |
| sewer-industrial | sewer | medium | 0.82 | 31x23 | 39 | 713 | 0.0547 | 43.5897 | 7 | 4 | 6 | 100 | 0.34 | PASS |
| sewer-industrial | sewer | large | 0.35 | 40x27 | 39 | 1080 | 0.0361 | 43.5897 | 7 | 4 | 6 | 100 | 0.35 | PASS |
| sewer-industrial | sewer | large | 0.82 | 35x28 | 39 | 980 | 0.0398 | 43.5897 | 7 | 4 | 6 | 100 | 0.35 | PASS |
| building-church | building | medium | 0.35 | 37x35 | 93 | 1295 | 0.0718 | 17.2043 | 7 | 6 | 3 | 100 | 2.92 | PASS |
| building-church | building | medium | 0.82 | 37x35 | 93 | 1295 | 0.0718 | 17.2043 | 7 | 6 | 3 | 100 | 2.16 | PASS |
| building-church | building | large | 0.35 | 44x41 | 92 | 1804 | 0.051 | 17.3913 | 7 | 6 | 3 | 100 | 1.05 | PASS |
| building-church | building | large | 0.82 | 44x41 | 92 | 1804 | 0.051 | 17.3913 | 7 | 6 | 3 | 100 | 0.85 | PASS |
| building-workshop | building | medium | 0.35 | 32x26 | 18 | 832 | 0.0216 | 50 | 3 | 2 | 4 | 100 | 0.48 | PASS |
| building-workshop | building | medium | 0.82 | 31x20 | 31 | 620 | 0.05 | 38.7097 | 4 | 3 | 5 | 100 | 0.33 | PASS |
| building-workshop | building | large | 0.35 | 33x21 | 18 | 693 | 0.026 | 50 | 3 | 2 | 4 | 100 | 0.23 | PASS |
| building-workshop | building | large | 0.82 | 26x22 | 31 | 572 | 0.0542 | 38.7097 | 4 | 3 | 5 | 100 | 0.5 | PASS |
| adaptive-forest | adaptive | medium | 0.35 | 51x44 | 2686 | 2244 | 1.197 | 1.7498 | 20 | 14 | 13 | 100 | 19.39 | PASS |
| adaptive-forest | adaptive | medium | 0.82 | 51x45 | 3136 | 2295 | 1.3664 | 1.7538 | 26 | 16 | 13 | 100 | 22.12 | PASS |
| adaptive-forest | adaptive | large | 0.35 | 68x57 | 4484 | 3876 | 1.1569 | 1.2935 | 27 | 16 | 15 | 94 | 28.83 | PASS |
| adaptive-forest | adaptive | large | 0.82 | 63x60 | 4937 | 3780 | 1.3061 | 1.4179 | 36 | 19 | 15 | 98 | 34.49 | PASS |
| adaptive-tower | adaptive | medium | 0.35 | 84x65 | 5888 | 5460 | 1.0784 | 0.9341 | 30 | 12 | 13 | 85 | 30.81 | PASS |
| adaptive-tower | adaptive | medium | 0.82 | 80x72 | 6368 | 5760 | 1.1056 | 1.1307 | 40 | 14 | 18 | 90 | 31.95 | PASS |
| adaptive-tower | adaptive | large | 0.35 | 117x92 | 11353 | 10764 | 1.0547 | 0.6694 | 42 | 15 | 19 | 78 | 59.68 | PASS |
| adaptive-tower | adaptive | large | 0.82 | 110x92 | 10942 | 10120 | 1.0812 | 0.8591 | 55 | 15 | 24 | 83 | 58.42 | PASS |

## Worst five

- wilderness-forest / large / 0.35: quality 73, 6381 primitives, density 1.1306, yield 0.5015
- wilderness-forest / large / 0.82: quality 75, 6868 primitives, density 1.26, yield 0.5679
- adaptive-tower / large / 0.35: quality 78, 11353 primitives, density 1.0547, yield 0.6694
- adaptive-tower / large / 0.82: quality 83, 10942 primitives, density 1.0812, yield 0.8591
- adaptive-tower / medium / 0.35: quality 85, 5888 primitives, density 1.0784, yield 0.9341

## Best five

- adaptive-forest / medium / 0.82: quality 100, 3136 primitives, density 1.3664, yield 1.7538
- adaptive-forest / medium / 0.35: quality 100, 2686 primitives, density 1.197, yield 1.7498
- building-workshop / large / 0.82: quality 100, 31 primitives, density 0.0542, yield 38.7097
- building-workshop / large / 0.35: quality 100, 18 primitives, density 0.026, yield 50
- building-workshop / medium / 0.82: quality 100, 31 primitives, density 0.05, yield 38.7097