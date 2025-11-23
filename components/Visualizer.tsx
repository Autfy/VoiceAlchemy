import React, { useEffect, useRef } from 'react';
import { AudioVisualizerProps } from '../types';

export const Visualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) return;

    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();
    }
    
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');

    const draw = () => {
      if (!canvasCtx) return;
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = 'rgb(15, 23, 42)'; // Background color match
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];

        // Gradient color based on height
        const r = barHeight + 25 * (i / bufferLength);
        const g = 250 * (i / bufferLength);
        const b = 50;

        canvasCtx.fillStyle = `rgb(${r},${g},${b})`;
        canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      // We don't close the context here as it might be reused or cause latency
    };
  }, [stream, isActive]);

  return (
    <div className="w-full h-48 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-inner flex items-center justify-center relative">
      {!isActive && (
         <div className="absolute text-slate-500 font-mono text-sm animate-pulse">
            Waiting for audio input...
         </div>
      )}
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={200} 
        className="w-full h-full object-cover"
      />
    </div>
  );
};