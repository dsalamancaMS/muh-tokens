'use server';

import { revalidatePath } from 'next/cache';
import { getSyncStatus, runSync } from '@/lib/server';
import type { SyncStatus } from '@/lib/types';

export async function syncNow(): Promise<{ newCalls: number } | { error: string }> {
  try {
    const { newCalls } = await runSync();
    revalidatePath('/', 'layout');
    return { newCalls };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function syncStatus(): Promise<SyncStatus> {
  return getSyncStatus();
}
