#!/bin/bash
# Dwuklik w Finderze uruchamia aplikację. (Przy pierwszym razie: PPM -> Otwórz)
cd "$(dirname "$0")"
exec node src/index.js "$@"
