import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'

interface SketchPadProps {
  onClose: () => void
  onSave: (dataUrl: string) => void
}

export function SketchPad({ onClose, onSave }: SketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [ink, setInk] = useState('#1f2923')

  const prepareCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.fillStyle = '#fffdf7'
    context.fillRect(0, 0, rect.width, rect.height)
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }

  useEffect(prepareCanvas, [])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    setDrawing(true)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    const point = pointFromEvent(event)
    context.strokeStyle = ink
    context.lineWidth = ink === '#d7ff52' ? 14 : 4
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  return (
    <div className="sketch-backdrop" role="dialog" aria-modal="true" aria-label="手寫畫布">
      <div className="sketch-panel">
        <header>
          <div>
            <span className="eyebrow">HANDWRITE</span>
            <h2>手寫一下</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X size={20} />
          </button>
        </header>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => setDrawing(false)}
          onPointerCancel={() => setDrawing(false)}
        />
        <footer>
          <div className="ink-picker" aria-label="筆色">
            {['#1f2923', '#3567ff', '#ff6e56', '#d7ff52'].map((color) => (
              <button
                key={color}
                className={ink === color ? 'active' : ''}
                style={{ background: color }}
                onClick={() => setInk(color)}
                aria-label={`選擇 ${color}`}
              />
            ))}
          </div>
          <button className="text-button" onClick={prepareCanvas}>
            <RotateCcw size={17} /> 清除
          </button>
          <button
            className="primary-button"
            onClick={() => {
              const canvas = canvasRef.current
              if (canvas) onSave(canvas.toDataURL('image/png'))
            }}
          >
            <Check size={18} /> 加入筆記
          </button>
        </footer>
      </div>
    </div>
  )
}
