/*
  The sun and the building never move, so the shadow map is redrawn only
  when something that casts a shadow does: walls rising, beds filling,
  equipment gliding. Orbiting the camera reuses the last shadow map.
*/
let dirty = true

export const markShadows = () => {
  dirty = true
}

export const takeShadowFlag = () => {
  const was = dirty
  dirty = false
  return was
}
