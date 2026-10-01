/*
  Encodes the captured frames (tools/film/capture.mjs) with ffmpeg:
    film/cutaway-720.mp4   H.264, for the portfolio case study
    film/cutaway-still.webp the poster frame
    film/cutaway-loop.webp  a short animated loop for the README
*/
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const FRAMES = process.argv[2] ?? 'film-frames'
const OUT = 'film'
const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
mkdirSync(OUT, { recursive: true })

ff('-framerate', '30', '-i', join(FRAMES, 'f%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, 'cutaway-720.mp4'))
ff('-i', join(FRAMES, 'f00150.png'), '-quality', '82', join(OUT, 'cutaway-still.webp'))
// The first 12 s at 15 fps and 800 px wide: the opening shot and the layers.
ff('-framerate', '30', '-start_number', '0', '-i', join(FRAMES, 'f%05d.png'), '-vf', 'trim=end=12,fps=15,scale=800:-1:flags=lanczos', '-loop', '0', '-quality', '70', join(OUT, 'cutaway-loop.webp'))
console.log('encoded into', OUT)
