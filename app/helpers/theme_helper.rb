# frozen_string_literal: true

module ThemeHelper
  def theme_style_tags(flavour_and_skin)
    flavour, theme = flavour_and_skin

    if theme == 'system'
      ''.html_safe.tap do |tags|
        tags << stylesheet_pack_tag("skins/#{flavour}/mastodon-light", media: 'not all and (prefers-color-scheme: dark)', crossorigin: 'anonymous')
        tags << stylesheet_pack_tag("skins/#{flavour}/default", media: '(prefers-color-scheme: dark)', crossorigin: 'anonymous')
      end
    else
      stylesheet_pack_tag "skins/#{flavour}/#{theme}", media: 'all', crossorigin: 'anonymous'
    end
  end

  def theme_color_tags(flavour_and_skin)
    _, theme = flavour_and_skin

    if theme == 'system'
      ''.html_safe.tap do |tags|
        tags << tag.meta(name: 'theme-color', content: '#787878', media: '(prefers-color-scheme: dark)')
        tags << tag.meta(name: 'theme-color', content: '#787878', media: '(prefers-color-scheme: light)')
      end
    else
      tag.meta name: 'theme-color', content: '#787878'
    end
  end

  private

  def theme_color_for(theme)
    theme == 'mastodon-light' ? Themes::THEME_COLORS[:light] : Themes::THEME_COLORS[:dark]
  end
end
