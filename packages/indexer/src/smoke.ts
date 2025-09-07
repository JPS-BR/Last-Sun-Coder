import { makeParser } from './parser';

const parser = makeParser(false); // TS (use true p/ TSX)
const src = 'function sum(a:number,b:number){return a+b}';
const tree = parser.parse(src);

console.log('root:', tree.rootNode.type, 'children:', tree.rootNode.childCount);
