// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { IoLogoGithub, IoKeyOutline } from "react-icons/io5";
import ContactForm from '@/components/forms/ContactForm';
import { STATIC_PATHS } from '@/config/navigation';

export const metadata = {
  title: 'Contact Us | Activist Checklist',
};

export default async function ContactPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <Layout>
      <div>
        <div>
          <section className="prose mb-12">
            <h1 className="page-title">{t('contact.title')}</h1>
            <p>
              {t('contact.intro')}
            </p>
            <ul>
              <li>{t('contact.suggestion1')}</li>
              <li>{t('contact.suggestion2')}</li>
              <li>{t('contact.suggestion3')}</li>
              <li>{t('contact.suggestion4')}</li>
            </ul>
          </section>

          <div className="mb-16">
            <div className="mb-6 flex items-baseline gap-2">
              <h2 className="">{t('contact.sendMessage')}</h2>
              <span className="text-sm text-muted-foreground">{t('contact.recommended')}</span>
            </div>
            <ContactForm context="contact_page" />
          </div>

          <div className="prose">
            <h2 className="mb-4" style={{ borderBottom: 'none' }}>{t('contact.otherWays')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <IoLogoGithub className="w-5 h-5" />
                  {t('contact.githubTitle')}
                </CardTitle>
                <CardDescription>
                  {t('contact.githubDescription')}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <a
                  href="https://github.com/ActivistChecklist/ActivistChecklist"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t('contact.githubLink')}
                </a>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <IoKeyOutline className="w-5 h-5" />
                  {t('contact.emailTitle')}
                </CardTitle>
                <CardDescription>
                  {t('contact.emailDescription')}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex-col items-start space-y-2">
                <a
                  href="mailto:contact@activistchecklist.org"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  contact@activistchecklist.org
                </a>
                <a
                  href={STATIC_PATHS.pgpKeyFile}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t('contact.pgpLink')}
                </a>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
