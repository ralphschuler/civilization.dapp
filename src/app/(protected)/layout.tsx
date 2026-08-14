import { auth } from '@/auth';
import { getAuthorizedWallet } from '@/lib/civilization-session-guard';
import { redirect } from 'next/navigation';

export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // If the user is not authenticated, redirect to the login page
  if (!getAuthorizedWallet(session)) redirect('/');

  return children;
}
