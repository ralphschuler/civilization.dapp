import { auth } from '@/auth';
import CivilizationClient from '@/components/CivilizationClient';
import { runtimeConfiguration } from '@/lib/runtime-config';
import { getAuthorizedWallet } from '@/lib/civilization-session-guard';
import { redirect } from 'next/navigation';

export default async function GamePage() {
  const session = await auth();
  const walletAddress = getAuthorizedWallet(session);
  if (!walletAddress) redirect('/');
  const { world } = runtimeConfiguration();
  return <CivilizationClient walletAddress={walletAddress} worldConfiguration={world} />;
}
