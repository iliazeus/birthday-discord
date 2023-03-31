#!/bin/sh

esbuild \
  --bundle --platform=node --sourcemap=inline --minify --keep-names --charset=utf8 \
  --loader:.node=copy \
  --banner:js="#!/usr/bin/env node" \
  ./src/main.ts \
  --outfile=./dist/main.js
