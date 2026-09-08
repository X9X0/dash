import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// Loads server/.env into process.env.
//
// This module must be the FIRST import in src/index.ts. ES module imports are
// hoisted and evaluated in order, so any module that reads process.env at load
// time (lib/jwt.ts, lib/paths.ts) would otherwise run before dotenv did.
//
// The file is located relative to this module (server/src/lib or server/dist/lib
// -> server/.env) rather than the working directory: under systemd the working
// directory is the project root, where no .env exists. Variables already present
// in the environment (e.g. systemd's NODE_ENV) are never overridden.
const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(here, '../../.env') })
// Backwards compatibility: also honour a .env in the working directory.
dotenv.config()
