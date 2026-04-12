export async function detectWordFromImage(fileName: string): Promise<string> {
  return Promise.resolve(fileName.replace(/\.[^.]+$/, '') || 'example');
}

