// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import UpdatesPage from '@/components/updates/UpdatesPage';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'updates' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function Page({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Layout>
      <div className="mx-auto w-full max-w-xl py-8 sm:py-12">
        <UpdatesPage />
      </div>
    </Layout>
  );
}
