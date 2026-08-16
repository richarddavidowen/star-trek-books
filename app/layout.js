import './globals.css';
import './booklinks.css';
import LcarsToggle from './LcarsToggle';
export const metadata={title:'Star Trek Books',description:'Star Trek book catalogue and reading tracker'};
export default function RootLayout({children}){return <html lang="en" data-theme="classic"><body><LcarsToggle/>{children}</body></html>}
