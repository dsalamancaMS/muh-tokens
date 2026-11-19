'use server';

import { revalidatePath } from 'next/cache';
import { runSync } from '@/lib/server';

export async function syncNow(): Promise<{ newCalls: number } | { error: string }> {
  try {
    const { newCalls } = await runSync();
    revalidatePath('/', 'layout');
    return { newCalls };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
