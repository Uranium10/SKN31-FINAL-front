import React from 'react';

export const UndulatingGrid = () => (
  <svg className="grid-mesh" viewBox="0 0 280 200" preserveAspectRatio="none" aria-hidden="true">
    <path className="wave-h-line w00" d="M 0,14 Q 35,6 70,14 T 140,14 T 210,14 T 280,14" />
    <path className="wave-h-line w0" d="M 0,36 Q 35,24 70,36 T 140,36 T 210,36 T 280,36" />
    <path className="wave-h-line w1" d="M 0,64 Q 35,48 70,64 T 140,64 T 210,64 T 280,64" />
    <path className="wave-h-line w2" d="M 0,98 Q 35,78 70,98 T 140,98 T 210,98 T 280,98" />
    <path className="wave-h-line w3" d="M 0,138 Q 35,114 70,138 T 140,138 T 210,138 T 280,138" />
    <path className="wave-h-line w4" d="M 0,182 Q 35,154 70,182 T 140,182 T 210,182 T 280,182" />

    <g className="flowing-vertical-group">
      {[-35, 0, 35, 70, 105, 140, 175, 210, 245, 280, 315].map((x, i) => (
        <path
          key={i}
          className="wave-v-rib"
          d={`M ${x},10 C ${x + 14},60 ${x - 14},120 ${x},190`}
        />
      ))}
    </g>
  </svg>
);

export default UndulatingGrid;
