'use client';
import Link from '@/components/Link'
import { DarkModeToggle } from "@/components/layout/DarkModeToggle"
import { CompactNewsletterSubscribe } from "@/components/NewsletterSubscribe"
import { footerConfig } from '@/config/navigation'
import { useTranslations } from 'next-intl'
import { createIntlTranslator, translateNavigationItem } from '@/lib/navigation-i18n'
import { SiTorbrowser } from 'react-icons/si'

export function Footer() {
  const t = useTranslations();

  const translateText = createIntlTranslator(t);

  const sectionTitleKeys = {
    Navigation: 'footer.sections.navigation',
    'Top Checklists': 'footer.sections.topChecklists',
  };

  const socialAriaLabelKeys = {
    bluesky: 'footer.social.blueskyAriaLabel',
    github: 'footer.social.githubAriaLabel',
    mastodon: 'footer.social.mastodonAriaLabel',
  };

  const translatedSections = footerConfig.sections.map((section) => ({
    ...section,
    title: sectionTitleKeys[section.title]
      ? translateText(sectionTitleKeys[section.title], section.title)
      : section.title,
    items: section.items.map((item) => translateNavigationItem(item, translateText)),
  }));

  return (
    <footer className="print:hidden bg-muted text-muted-foreground py-12">
      <div className="container max-w-6xl mx-auto px-4 md:px-8">

        {/* Main columns */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
          <div className="col-span-3">
            <h2 className="text-2xl font-bold text-foreground mb-4">{t('footer.branding.title')}</h2>
            <p className="mb-4 max-w-lg">{t('footer.branding.description')}</p>
            <div className="mb-6">
              <h3 className="text-sm font-semibold tracking-wider uppercase mb-2">{t('footer.stayUpdated')}</h3>
              <CompactNewsletterSubscribe />
            </div>
          </div>

          {translatedSections.map((section, index) => (
            <div key={index}>
              <h3 className="text-sm font-semibold tracking-wider uppercase mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="hover:text-foreground transition-colors">
                      {item.title || item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom section */}
        <div className="border-t border-border pt-8 flex flex-col gap-4 text-sm">
          <p className="italic">{t('footer.disclaimer')}</p>

          <p>
            {t.rich('footer.licenseNotice', {
              cc: (chunks) => (
                <Link href="https://creativecommons.org/licenses/by-sa/4.0/" className="hover:text-foreground underline underline-offset-2 transition-colors">
                  {chunks}
                </Link>
              ),
              sources: (chunks) => (
                <Link href="/about/#sources" className="hover:text-foreground underline underline-offset-2 transition-colors">
                  {chunks}
                </Link>
              ),
              github: (chunks) => (
                <Link href="https://github.com/ActivistChecklist/ActivistChecklist" className="hover:text-foreground underline underline-offset-2 transition-colors">
                  {chunks}
                </Link>
              ),
            })}
          </p>

          {/* Utility bar: theme left, social right */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
            <DarkModeToggle />
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/onion/"
                aria-label={t('footer.onion.ariaLabel')}
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <SiTorbrowser className="h-5 w-5" aria-hidden="true" />
                <span>{t('footer.onion.label')}</span>
              </Link>
              {footerConfig.socialLinks?.map((social) => (
                <a
                  key={social.key}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    socialAriaLabelKeys[social.key]
                      ? translateText(socialAriaLabelKeys[social.key], social.ariaLabel)
                      : social.ariaLabel
                  }
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                >
                  <social.icon className="h-5 w-5" aria-hidden="true" />
                  <span>{social.username}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

      </div>
    </footer>
  )
}

export default Footer
