declare module 'moonlands/dist/cards' {
  import Card from './classes/Card';
  export declare const cards: Card[];
  export declare const byName: (name: string) => Card;
}
