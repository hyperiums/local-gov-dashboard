import { ImageResponse } from 'next/og';
import { cityName, cityLocation, operatorDisclosure } from '@/lib/city-config-client';

// A link shared to Facebook is the one place the disclosure has to survive
// without the site around it: the card is all most people will ever see. So the
// card itself carries the sentence, not just the page it points at.
export const alt = `${cityName} Civic Dashboard. ${operatorDisclosure}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#065f46',
          color: '#ffffff',
          padding: 64,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, color: '#a7f3d0', letterSpacing: 2 }}>
            {cityLocation.toUpperCase()}
          </div>
          {/* Interpolation and literal text would be two child nodes, which
              satori rejects on a non-flex div, so each line is one string. */}
          <div style={{ fontSize: 78, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
            {`${cityName} Civic Dashboard`}
          </div>
          <div style={{ fontSize: 36, color: '#d1fae5', marginTop: 24 }}>
            Public records, in plain language
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            borderRadius: 16,
            padding: '24px 32px',
            fontSize: 32,
            color: '#e2e8f0',
          }}
        >
          {operatorDisclosure}
        </div>
      </div>
    ),
    size
  );
}
