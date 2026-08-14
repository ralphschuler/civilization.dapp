import { auth } from '@/auth';
import CivilizationClient from '@/components/CivilizationClient';
import { runtimeConfiguration } from '@/lib/runtime-config';
import { redirect } from 'next/navigation';

export default async function GamePage() {
  const session = await auth();
  if (!session?.user?.walletAddress) redirect('/');
  const { world } = runtimeConfiguration();
  return <CivilizationClient walletAddress={session.user.walletAddress} worldConfiguration={world} />;
}
