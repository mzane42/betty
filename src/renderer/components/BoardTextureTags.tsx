import { boardTextures, type BoardTexture } from '../lib/card-eval.js';

interface Props {
  board: string[] | null;
}

const LABEL: Record<BoardTexture, string> = {
  paired: 'Paired',
  monotone: 'Monotone',
  'flush-draw': 'Flush draw',
  rainbow: 'Rainbow',
  connected: 'Connected',
  high: 'High'
};

export function BoardTextureTags({ board }: Props): JSX.Element | null {
  const tags = boardTextures(board);
  if (tags.length === 0) return null;
  return (
    <span className="texture-tags">
      {tags.map((t) => (
        <span key={t} className={`texture-tag texture-${t}`}>{LABEL[t]}</span>
      ))}
    </span>
  );
}
