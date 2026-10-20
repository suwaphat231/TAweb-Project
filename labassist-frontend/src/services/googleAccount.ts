import { googleLogout } from '@react-oauth/google'

// Signs this browser out of every Google account (Gmail and YouTube too) in a
// new tab, so the next person's Google sign-in goes through the university
// login page instead of reusing the previous person's Google session.
export function signOutOfGoogle() {
  googleLogout()
  window.open('https://accounts.google.com/Logout', '_blank', 'noopener')
}
