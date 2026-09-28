declare module 'troika-three-text' {
  import { Color, Mesh } from 'three'

  export class Text extends Mesh {
    text: string
    font: string | null
    fontSize: number
    anchorX: number | 'left' | 'center' | 'right'
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom'
    textAlign: 'left' | 'right' | 'center' | 'justify'
    maxWidth: number
    letterSpacing: number
    color: string | number | Color | null
    sync(callback?: () => void): void
    dispose(): void
  }

  export class BatchedText extends Text {
    addText(text: Text): void
    removeText(text: Text): void
  }
}
