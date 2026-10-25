import type { PlanNode } from '@shared/types'

/** 树里查找节点。数据量小，递归足够 */
export function findNodeById(nodes: readonly PlanNode[], id: string): PlanNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found) return found
  }
  return null
}

/** 扁平化，用于统计与"默认展开有子节点的项" */
export function flattenTree(nodes: readonly PlanNode[]): PlanNode[] {
  const result: PlanNode[] = []
  const walk = (list: readonly PlanNode[]): void => {
    for (const node of list) {
      result.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return result
}

/** 节点的祖先链，从根到父 */
export function ancestorIds(nodes: readonly PlanNode[], id: string): string[] {
  const path: string[] = []

  const walk = (list: readonly PlanNode[], trail: string[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        path.push(...trail)
        return true
      }
      if (walk(node.children, [...trail, node.id])) return true
    }
    return false
  }

  walk(nodes, [])
  return path
}
