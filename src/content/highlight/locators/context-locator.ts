import { createTextNodeWalker } from '../dom-utils';

/**
 * 通过上下文匹配查找文本范围
 * 用于提高富文本结构中的定位精度
 */
export function locateByContext(
  text: string,
  contextBefore?: string,
  contextAfter?: string
): Range | null {
  if (!contextBefore && !contextAfter) return null;
  
  const walker = createTextNodeWalker();
  if (!walker) return null;
  
  // 构建完整文本
  const textParts: string[] = [];
  const nodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  
  while (current) {
    if (current instanceof Text) {
      nodes.push(current);
      textParts.push(current.textContent ?? '');
    }
    current = walker.nextNode();
  }
  
  if (!nodes.length) return null;
  
  const fullText = textParts.join('');
  const searchPattern = (contextBefore ?? '') + text + (contextAfter ?? '');
  const index = fullText.indexOf(searchPattern);
  
  if (index === -1) return null;
  
  // 计算目标文本的实际位置
  const textStartIndex = index + (contextBefore?.length ?? 0);
  
  // 将索引映射到具体文本节点
  let remaining = textStartIndex;
  let startNode: Text | null = null;
  let startOffset = 0;
  
  for (const node of nodes) {
    const len = node.textContent?.length ?? 0;
    if (remaining < len) {
      startNode = node;
      startOffset = remaining;
      break;
    }
    remaining -= len;
  }
  
  if (!startNode) return null;
  
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  
  let remainingLength = text.length;
  let endNode: Text = startNode;
  let endOffset = Math.min(startOffset + remainingLength, startNode.textContent?.length ?? 0);
  remainingLength -= (endOffset - startOffset);
  
  let idx = nodes.indexOf(startNode);
  while (remainingLength > 0 && idx + 1 < nodes.length) {
    idx++;
    const nextNode = nodes[idx];
    const len = nextNode.textContent?.length ?? 0;
    if (len === 0) continue;
    
    if (remainingLength <= len) {
      endNode = nextNode;
      endOffset = remainingLength;
      remainingLength = 0;
      break;
    }
    
    remainingLength -= len;
    endNode = nextNode;
    endOffset = len;
  }
  
  range.setEnd(endNode, endOffset);
  return range;
}
