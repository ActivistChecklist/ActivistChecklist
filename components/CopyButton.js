'use client'

import { useState, useRef, useEffect } from 'react'
import { IoCopyOutline, IoCheckmarkSharp } from "react-icons/io5"
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

export default function CopyButton({ className = '' }) {
  const [copied, setCopied] = useState(false)
  const buttonRef = useRef(null)
  const timeoutRef = useRef(null)
  const t = useTranslations()

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const formatTextContent = (element) => {
    let text = ''
    const childNodes = element.childNodes

    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const trimmedText = node.textContent.trim()
        if (trimmedText) {
          text += trimmedText + '\n\n'
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Handle list items
        if (node.tagName === 'UL') {
          const items = node.querySelectorAll('li')
          items.forEach(item => {
            text += '• ' + item.textContent.trim() + '\n'
          })
          text += '\n' // Add an extra line break after the list
        } else if (node.tagName === 'P') {
          text += node.textContent.trim() + '\n\n'
        } else if (node.tagName !== 'BUTTON') { // Skip the copy button itself
          text += formatTextContent(node)
        }
      }
    }
    return text
  }

  const copyToClipboard = async () => {
    try {
      // Find the nearest blockquote ancestor; fall back to parent element
      const targetElement = buttonRef.current.closest('blockquote') || buttonRef.current.parentElement
      const formattedText = formatTextContent(targetElement)
        .replace(/Copy|Copied/g, '') // Remove "Copy" and "Copied" text
        .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
        .trim()

      // Use modern clipboard API
      await navigator.clipboard.writeText(formattedText)
      
      // Show success state
      setCopied(true)
      
      // Reset after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setCopied(false)
      }, 3000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <Button
      ref={buttonRef}
      onClick={copyToClipboard}
      variant="muted"
      size="sm"
      className={className}
      aria-label={t('copyButton.ariaLabel')}
    >
      {copied ? (
        <>
          <IoCheckmarkSharp />
          {t('copyButton.copied')}
        </>
      ) : (
        <>
          <IoCopyOutline />
          {t('copyButton.copy')}
        </>
      )}
    </Button>
  )
} 