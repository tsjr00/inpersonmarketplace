import { redirect } from 'next/navigation'

export default function PrivacyRedirect() {
  redirect('/farmers_market/terms#privacy-policy')
}
