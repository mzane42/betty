import { useState } from 'react';

interface Props {
  text: string;
}

export function InfoTooltip({ text }: Props): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <span
      className="info-tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="info-tooltip-icon" tabIndex={0}>
        ?
      </span>
      {show && (
        <span className="info-tooltip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
