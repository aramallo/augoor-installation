import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Augoor",
  description: "Installation Guide",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Augoor.com', link: 'https://augoor.com' }
    ],

    sidebar: [
      {
        text: 'Guides',
        items: [
          { text: 'Getting Started', link: '/guides/' },
          { text: 'Installing on AWS', link: '/guides/AWS' },
          { text: 'Installing on Azure', link: '/guides/Azure' },
          { text: 'Installing on GCP', link: '/guides/GCP' },
          { text: 'Installing on OpenShift', link: '/guides/OpenShift' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/augoor-installation/augoor-installation' }
    ]
  }
})
