import type { Clip } from '@/types/clip';
import { clipService } from '@/background/services/clip-service';

export async function handleRequestClips(): Promise<Clip[]> {
  return clipService.listAll();
}