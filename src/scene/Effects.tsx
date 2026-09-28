import { EffectComposer, N8AO } from '@react-three/postprocessing'

/** Ambient occlusion: the contact darkness that makes a white model read. Desktop only. */
export default function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={1.1} distanceFalloff={0.9} intensity={2} quality="medium" halfRes />
    </EffectComposer>
  )
}
