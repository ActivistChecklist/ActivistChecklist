'use client';
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { useAnalytics } from '@/hooks/use-analytics';
import { useTranslations } from 'next-intl';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Alert } from '@/components/ui/alert';
import { MAX_CHARS, RESPONSE_OPTIONS, formSchema } from './contactFormSchema';

const RESPONSE_LABEL_KEYS = {
  none: 'contactForm.responseNone',
  signal_username: 'contactForm.responseSignalUsername',
  signal_phone: 'contactForm.responseSignalPhone',
  email: 'contactForm.responseEmail',
};

const ContactForm = ({ successMessage, context = 'default' }) => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const [showForm, setShowForm] = useState(true);
  const { trackEvent } = useAnalytics();
  const t = useTranslations();

  const form = useForm({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      message: "",
      responseType: "none",
      email: "",
      signalUsername: "",
      signalPhone: "",
    },
  });

  const { isSubmitting } = form.formState;
  const messageLength = form.watch("message")?.length || 0;
  const remainingChars = MAX_CHARS - messageLength;
  const responseType = form.watch("responseType");

  const resetForm = () => {
    form.reset();
    setStatus({ type: '', message: '' });
    setShowForm(true);
  };

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });

    try {
      if (typeof window !== 'undefined') {
        trackEvent({
          name: 'contact_form_submitted',
          data: {
            context,
            response_type: data.responseType,
          }
        });
      }

      const response = await fetch('/api-server/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          pagePath: typeof window !== 'undefined' ? window.location.pathname : '',
        })
      });

      const responseData = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: successMessage || t('contact.successMessage') });
        form.reset();
        setShowForm(false);
      } else {
        throw new Error(responseData.message || 'Failed to send message');
      }
    } catch (error) {
      console.error(error);
      setStatus({
        type: 'error',
        message: t('contactForm.errorMessage'),
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {status.message && (
        <Alert
          variant={status.type === 'success' ? 'success' : 'error'}
          className="mb-4"
        >
          <div>
            <p>
              {status.message}
            </p>
          </div>
        </Alert>
      )}

      {showForm && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contactForm.messageLabel')}</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      onBlur={field.onBlur}
                      rows={6}
                      className={cn(
                        "w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                        "ring-offset-background",
                        "placeholder:text-muted-foreground",
                        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        form.formState.errors.message && [
                          "border-destructive",
                          "focus-visible:ring-destructive",
                        ]
                      )}
                      placeholder={t('contactForm.messagePlaceholder')}
                    />
                  </FormControl>
                  {remainingChars <= 500 && (
                    <FormDescription className="text-red-500">
                      {t('contactForm.charactersRemaining', { count: remainingChars })}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responseType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>{t('contactForm.responseQuestion')}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-1"
                    >
                      {RESPONSE_OPTIONS.map((option, index) => (
                        <div key={option.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={option.value} id={`r${index + 1}`} />
                          <label
                            htmlFor={`r${index + 1}`}
                            className={cn(
                              "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                              "flex items-center gap-2"
                            )}
                          >
                            {t(RESPONSE_LABEL_KEYS[option.value])}
                            {option.recommended && (
                              <Badge variant="default">{t('contactForm.mostSecure')}</Badge>
                            )}
                          </label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {responseType === 'email' && (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contactForm.emailLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('contactForm.emailPlaceholder')}
                        {...field}
                        onBlur={field.onBlur}
                        className={cn(
                          form.formState.errors.email && [
                            "border-destructive",
                            "focus-visible:ring-destructive",
                          ]
                        )}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('contactForm.emailNote')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {responseType === 'signal_username' && (
              <FormField
                control={form.control}
                name="signalUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contactForm.signalUsernameLabel')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder={t('contactForm.signalUsernamePlaceholder')}
                          {...field}
                          onBlur={field.onBlur}
                          onChange={(e) => {
                            // Remove @ symbol
                            const cleanedValue = e.target.value.replace(/@/g, '');
                            field.onChange(cleanedValue);
                          }}
                          className={cn(
                            "pl-7",
                            form.formState.errors.signalUsername && [
                              "border-destructive",
                              "focus-visible:ring-destructive",
                            ]
                          )}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Example: <code>{t('contactForm.signalUsernameExample')}</code> — {t('contactForm.signalUsernameHelp')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {responseType === 'signal_phone' && (
              <FormField
                control={form.control}
                name="signalPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contactForm.signalPhoneLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('contactForm.signalPhonePlaceholder')}
                        {...field}
                        onBlur={field.onBlur}
                        className={cn(
                          form.formState.errors.signalPhone && [
                            "border-destructive",
                            "focus-visible:ring-destructive",
                          ]
                        )}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button
              type="submit"
              disabled={isSubmitting || !form.formState.isValid}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contactForm.sending')}
                </>
              ) : (
                t('contactForm.sendMessage')
              )}
            </Button>
            <div className="mb-8 text-sm text-muted-foreground">
              <p>
                <b>{t('contactForm.privacyLabel')}</b> {t('contactForm.privacyText')}
              </p>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
};

export default ContactForm;
