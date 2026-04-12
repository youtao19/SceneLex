export function formatDate(value: string | Date) {
  return new Date(value).toLocaleString('zh-CN');
}

