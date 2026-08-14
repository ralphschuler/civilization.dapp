import { auth } from '@/auth';
import { CivilizationLogin } from '@/components/CivilizationLogin';
import { getAuthorizedWallet } from '@/lib/civilization-session-guard';
import Image from 'next/image';
import { redirect } from 'next/navigation';

export default async function Home() {
  if (getAuthorizedWallet(await auth())) redirect('/game');
  return (
    <main className="civilization-login-page"><section className="civilization-login-card">
      <p className="civilization-login-eyebrow">WORLD MINI APP</p>
      <Image className="civilization-login-art" src="/assets/village-v2/buildings/townhall.png" alt="Rathaus deines Dorfs" width={418} height={418} preload />
      <h1>Baue dein Dorf.</h1>
      <p className="civilization-login-copy">Melde dich mit deiner World Wallet an und öffne dein geschütztes Reich.</p>
      <CivilizationLogin />
    </section></main>
  );
}
