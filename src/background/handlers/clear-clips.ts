import { clipService } from '@/background/services/clip-service';

export async function handleClearClips(): Promise<void> {
  await clipService.clear();
}