// src/components/Login.tsx
import FaultyTerminal from "../components/FaultyTerminal"
import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="h-screen relative flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-300 fade-in w-[100vw] ">
        <FaultyTerminal
    scale={1.7}
    gridMul={[2, 1]}
    digitSize={1.2}
    timeScale={1}
    pause={false}
    scanlineIntensity={1}
    glitchAmount={2}
    flickerAmount={1}
    noiseAmp={1}
    chromaticAberration={0}
    dither={0}
    curvature={0}
    tint="#ffffff"
    mouseReact={true}
    mouseStrength={0.5}
    pageLoadAnimation={false}
    brightness={1}
 />
      <div className="bg-white p-10 rounded-2xl hover:shadow-2xl transition-all duration-300 shadow-xl text-center  max-w-md w-full transform fade-scale">
        <div className="flex justify-center">
          <div className="bounce-slow">
            <svg
              className="w-12 h-12 fill-current text-black"
              viewBox="0 0 24 24"
            >
              <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.1.79-.25.79-.56v-2.15c-3.2.7-3.88-1.55-3.88-1.55-.52-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.68.08-.68 1.14.08 1.74 1.18 1.74 1.18 1.01 1.73 2.66 1.23 3.3.94.1-.74.4-1.23.72-1.51-2.56-.29-5.26-1.29-5.26-5.75 0-1.27.45-2.3 1.18-3.12-.12-.3-.51-1.52.11-3.17 0 0 .96-.31 3.14 1.18a10.91 10.91 0 012.86-.39c.97.01 1.94.13 2.86.39 2.18-1.49 3.14-1.18 3.14-1.18.62 1.65.23 2.87.11 3.17.73.82 1.18 1.85 1.18 3.12 0 4.47-2.7 5.46-5.27 5.74.42.36.77 1.08.77 2.18v3.24c0 .31.21.67.8.56a10.52 10.52 0 007.86-10.96C23.5 5.74 18.27.5 12 .5z" />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-800">Welcome to DevDock</h1>

        <p className="text-black/70 text-sm px-2 mt-2">
          DevDock is a powerful desktop-based IDE with built-in containerized deployment support.
        </p>

        <button
          onClick={login}
          className="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-all w-full flex items-center justify-center cursor-pointer space-x-2 mt-10"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.1.79-.25.79-.56v-2.15c-3.2.7-3.88-1.55-3.88-1.55-.52-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.68.08-.68 1.14.08 1.74 1.18 1.74 1.18 1.01 1.73 2.66 1.23 3.3.94.1-.74.4-1.23.72-1.51-2.56-.29-5.26-1.29-5.26-5.75 0-1.27.45-2.3 1.18-3.12-.12-.3-.51-1.52.11-3.17 0 0 .96-.31 3.14 1.18a10.91 10.91 0 012.86-.39c.97.01 1.94.13 2.86.39 2.18-1.49 3.14-1.18 3.14-1.18.62 1.65.23 2.87.11 3.17.73.82 1.18 1.85 1.18 3.12 0 4.47-2.7 5.46-5.27 5.74.42.36.77 1.08.77 2.18v3.24c0 .31.21.67.8.56a10.52 10.52 0 007.86-10.96C23.5 5.74 18.27.5 12 .5z" />
          </svg>
          <span>Continue with GitHub</span>
        </button>
        <p className="text-black/50 text-sm mt-2 px-2">
          Write, debug, test, and deploy—all from a single intuitive interface.
        </p>

        
      </div>
    </div>
  );
}
