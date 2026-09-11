export type Side = 'white' | 'black';
export type Power = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Visual = Power;
export type Square = { row: number; col: number };

export type Piece = {
  id: string; side: Side; visual: Visual; power: Power; square: Square; hasMoved: boolean;
};
export type Move = { from: Square; to: Square; promotion?: Power };
export type GameState = {
  pieces: Piece[]; turn: Side; lastMove?: Move; status: 'playing' | 'over';
  winner?: Side; reason?: string; moveNumber: number;
};
export type PublicPiece = Omit<Piece, 'power'> & { power?: Power };
export type PublicState = { pieces: PublicPiece[]; turn: Side; lastMove?: Move; moveNumber: number };

const powers: Power[] = ['pawn','pawn','pawn','pawn','pawn','pawn','pawn','pawn','knight','knight','bishop','bishop','rook','rook','queen','king'];
const back: Visual[] = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
const same = (a: Square, b: Square) => a.row === b.row && a.col === b.col;
const inside = (s: Square) => s.row >= 0 && s.row < 8 && s.col >= 0 && s.col < 8;
const other = (side: Side): Side => side === 'white' ? 'black' : 'white';
const key = (s: Square) => `${s.row},${s.col}`;

function secureRandom() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; }
function shuffle<T>(items: T[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(secureRandom() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }

export function createGame(): GameState {
  const pieces: Piece[] = [];
  (['black', 'white'] as Side[]).forEach(side => {
    const rank = side === 'white' ? 7 : 0; const pawnRow = side === 'white' ? 6 : 1;
    const assigned = shuffle(powers);
    back.forEach((visual, col) => pieces.push({ id: `${side}-${visual}-${col}`, side, visual, power: assigned[col], square: { row: rank, col }, hasMoved: false }));
    for (let col = 0; col < 8; col++) pieces.push({ id: `${side}-pawn-${col}`, side, visual: 'pawn', power: assigned[8 + col], square: { row: pawnRow, col }, hasMoved: false });
  });
  return { pieces, turn: 'white', status: 'playing', moveNumber: 1 };
}

function at(state: GameState, square: Square) { return state.pieces.find(p => same(p.square, square)); }
function ray(state: GameState, piece: Piece, directions: Square[]) {
  const result: Square[] = [];
  directions.forEach(direction => { let square = { row: piece.square.row + direction.row, col: piece.square.col + direction.col };
    while (inside(square)) { const target = at(state, square); if (!target) result.push({ ...square }); else { if (target.side !== piece.side) result.push({ ...square }); break; } square = { row: square.row + direction.row, col: square.col + direction.col }; }
  }); return result;
}
const diagonals = [{row:1,col:1},{row:1,col:-1},{row:-1,col:1},{row:-1,col:-1}];
const orthogonals = [{row:1,col:0},{row:-1,col:0},{row:0,col:1},{row:0,col:-1}];

function pseudo(state: GameState, piece: Piece, attacks = false): Square[] {
  const { row, col } = piece.square;
  if (piece.power === 'bishop') return ray(state, piece, diagonals);
  if (piece.power === 'rook') return ray(state, piece, orthogonals);
  if (piece.power === 'queen') return ray(state, piece, [...diagonals, ...orthogonals]);
  if (piece.power === 'king') return [...diagonals, ...orthogonals].map(d => ({row: row+d.row, col: col+d.col})).filter(inside).filter(s => !at(state,s) || at(state,s)!.side !== piece.side);
  if (piece.power === 'knight') return [{row:-2,col:-1},{row:-2,col:1},{row:-1,col:-2},{row:-1,col:2},{row:1,col:-2},{row:1,col:2},{row:2,col:-1},{row:2,col:1}].map(d=>({row:row+d.row,col:col+d.col})).filter(inside).filter(s=>!at(state,s)||at(state,s)!.side!==piece.side);
  const dir = piece.side === 'white' ? -1 : 1; const result: Square[] = [];
  [-1, 1].forEach(dc => { const s={row:row+dir,col:col+dc}; if (inside(s) && (attacks || (!!at(state,s) && at(state,s)!.side !== piece.side))) result.push(s); });
  if (attacks) return result;
  const one = {row:row+dir,col}; if (inside(one) && !at(state,one)) { result.push(one); const two={row:row+2*dir,col}; if (!piece.hasMoved && inside(two) && !at(state,two)) result.push(two); }
  return result;
}

export function isAttacked(state: GameState, square: Square, by: Side) { return state.pieces.filter(p=>p.side===by).some(p=>pseudo(state,p,p.power==='pawn').some(s=>same(s,square))); }
export function royal(state: GameState, side: Side) { return state.pieces.find(p=>p.side===side && p.power==='king'); }
export function inCheck(state: GameState, side: Side) { const king=royal(state,side); return !!king && isAttacked(state,king.square,other(side)); }

function simulate(state: GameState, piece: Piece, to: Square, promotion?: Power): GameState { const pieces=state.pieces.filter(p=>!(p.square.row===to.row&&p.square.col===to.col&&p.side!==piece.side)).map(p=>p.id===piece.id?{...p,square:{...to},hasMoved:true,power:promotion ?? p.power}:p); return {...state,pieces}; }
export function legalMoves(state: GameState, piece: Piece): Square[] { return pseudo(state,piece).filter(to => { const target=at(state,to); return !(target?.power==='king') && !inCheck(simulate(state,piece,to),piece.side); }); }
export function allLegalMoves(state: GameState, side: Side) { return state.pieces.filter(p=>p.side===side).flatMap(p=>legalMoves(state,p).map(to=>({from:p.square,to}))); }

export function applyMove(state: GameState, move: Move): GameState | null {
  const piece=at(state,move.from); if (!piece || piece.side!==state.turn || !legalMoves(state,piece).some(s=>same(s,move.to))) return null;
  const promotion = piece.power === 'pawn' && (move.to.row===0 || move.to.row===7) ? (move.promotion ?? 'queen') : undefined;
  const next=simulate(state,piece,move.to,promotion); const nextTurn=other(state.turn); const moves=allLegalMoves(next,nextTurn);
  if (!royal(next,nextTurn)) return {...next,turn:nextTurn,lastMove:{...move,promotion},moveNumber:state.moveNumber+(state.turn==='black'?1:0),status:'over',winner:state.turn,reason:'Checkmate'};
  const royalNext=royal(next,nextTurn); const checked=inCheck(next,nextTurn);
  const status=moves.length===0?'over':'playing'; const reason=moves.length===0?(checked?'Checkmate':'Stalemate'):undefined;
  return {...next,turn:nextTurn,lastMove:{...move,promotion},moveNumber:state.moveNumber+(state.turn==='black'?1:0),status,winner:status==='over'?(checked?state.turn:undefined):undefined,reason};
}

export function toPublicState(state: GameState, observer: Side): PublicState { return { pieces: state.pieces.map(p=>p.side===observer?{...p}:{...p,power:undefined}), turn:state.turn,lastMove:state.lastMove,moveNumber:state.moveNumber }; }
export type BeliefState = Record<string, Power[]>;
export function createBeliefs(state: GameState, observer: Side): BeliefState { const counts: Record<Power,number>={pawn:8,knight:2,bishop:2,rook:2,queen:1,king:1}; return Object.fromEntries(state.pieces.filter(p=>p.side!==observer).map(p=>[p.id, (Object.keys(counts) as Power[])])); }

// AI operates on a public view and its private belief state. It never receives opponent powers.
export function chooseAiMove(publicState: PublicState, beliefs: BeliefState): Move | null {
  const mine=publicState.pieces.filter(p=>p.side==='black' && p.power); const occupied=new Set(publicState.pieces.map(p=>key(p.square)));
  const candidates: Move[]=[]; mine.forEach(p=>{ const power=p.power!; const add=(s:Square)=>{if(inside(s)&&(!occupied.has(key(s))||publicState.pieces.some(t=>key(t.square)===key(s)&&t.side==='white'))&&!(power==='pawn'&&s.col!==p.square.col&&!occupied.has(key(s)))) candidates.push({from:p.square,to:s});};
    if(power==='king'||power==='knight'){ const ds=power==='king'?[...diagonals,...orthogonals]:[{row:-2,col:-1},{row:-2,col:1},{row:-1,col:-2},{row:-1,col:2},{row:1,col:-2},{row:1,col:2},{row:2,col:-1},{row:2,col:1}]; ds.forEach(d=>add({row:p.square.row+d.row,col:p.square.col+d.col})); }
    else { const ds=power==='bishop'?diagonals:power==='rook'?orthogonals:[...diagonals,...orthogonals]; ds.forEach(d=>{for(let i=1;i<8;i++){const s={row:p.square.row+d.row*i,col:p.square.col+d.col*i}; if(!inside(s)||occupied.has(key(s))){if(inside(s)&&publicState.pieces.some(t=>key(t.square)===key(s)&&t.side==='white'))add(s);break;} add(s);}}); }
    if(power==='pawn'){const dir=1; add({row:p.square.row+dir,col:p.square.col}); add({row:p.square.row+dir,col:p.square.col-1}); add({row:p.square.row+dir,col:p.square.col+1});}
  }); return candidates.length ? candidates[Math.floor(secureRandom()*candidates.length)] : null;
}
