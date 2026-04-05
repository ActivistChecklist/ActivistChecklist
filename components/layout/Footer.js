'use client';
import Link from '@/components/Link'
import { DarkModeToggle } from "@/components/layout/DarkModeToggle"
import { CompactNewsletterSubscribe } from "@/components/NewsletterSubscribe"
import { footerConfig } from '@/config/navigation'
import { useTranslations } from 'next-intl'
import { createIntlTranslator, translateNavigationItem } from '@/lib/navigation-i18n'

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
    <footer className="print:hidden bg-gray-100 text-gray-600 py-12">
      <div className="container max-w-6xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
          <div className="col-span-3">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{t('footer.branding.title')}</h2>
            <p className="mb-4 max-w-lg">{t('footer.branding.description')}</p>
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase mb-2">{t('footer.stayUpdated')}</h3>
              <CompactNewsletterSubscribe />
            </div>
          </div>
          
          {translatedSections.map((section, index) => (
            <div key={index}>
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="hover:text-gray-800">
                      {item.title || item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t text-sm border-gray-200 pt-8 flex flex-col gap-4">
          <p className="text-gray-500 italic">
            {t('footer.disclaimer')}
          </p>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <p>
              {t.rich('footer.licenseNotice', {
                cc: (chunks) => (
                  <Link
                    href="https://creativecommons.org/licenses/by-sa/4.0/"
                    className="hover:text-gray-800 underline underline-offset-2"
                  >
                    {chunks}
                  </Link>
                ),
                sources: (chunks) => (
                  <Link
                    href="/about/#sources"
                    className="hover:text-gray-800 underline underline-offset-2"
                  >
                    {chunks}
                  </Link>
                ),
                github: (chunks) => (
                  <Link
                    href="https://github.com/ActivistChecklist/ActivistChecklist"
                    className="hover:text-gray-800 underline underline-offset-2"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          <div className="flex flex-wrap items-center gap-4 mt-4 md:mt-0">
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
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <social.icon className="h-5 w-5" aria-hidden="true" />
                <span>{social.username}</span>
              </a>
            ))}
            {/* <DarkModeToggle /> */}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
