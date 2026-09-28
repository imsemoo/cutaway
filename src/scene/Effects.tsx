import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'

/*
  Ambient occlusion: the contact darkness that makes a white model read.
  Measured at 1280 by 800, orbiting close to a room: MSAA inside the
  composer cost about 20 fps, so edges are smoothed by SMAA instead, and
  N8AO runs at half resolution on its low preset. Below the top quality
  level SMAA is dropped first.
*/
const ao = <N8AO aoRadius={1.1} distanceFalloff={0.9} intensity={2} quality="low" halfRes />

export default function Effects({ smaa }: { smaa: boolean }) {
  return smaa ? (
    <EffectComposer multisampling={0}>
      {ao}
      <SMAA />
    </EffectComposer>
  ) : (
    <EffectComposer multisampling={0}>{ao}</EffectComposer>
  )
}
