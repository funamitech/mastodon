# frozen_string_literal: true

class ActivityPub::FetchReactionsService < BaseService
  include JsonLdHelper

  # Limit of fetched reactions per post
  MAX_REACTIONS = 100

  ACTIVITY_TYPES = %w(Like EmojiReact).freeze

  # Custom emoji reactions carry the shortcode and, in Misskey, the emoji's
  # host (`.` for the server the reaction was made on)
  CUSTOM_EMOJI_REGEX = /\A:(?<shortcode>[^:@]+)(?:@(?<domain>[^:]+))?:\z/

  # Notes of Misskey and its forks, which serve reactions through their API
  # rather than through a collection
  MISSKEY_NOTE_URI = %r{\Ahttps://(?<host>[^/]+)/notes/(?<id>[a-z0-9]+)\z}i

  # Returns the number of reactions added
  def call(status, request_id: nil)
    @status     = status
    @request_id = request_id

    items = collection_reactions || misskey_reactions
    return 0 if items.blank?

    items.take(MAX_REACTIONS).count { |item| process_reaction(item) }
  end

  private

  # FEP-c0e0: the note advertises an `emojiReactions` collection of `Like`
  # and `EmojiReact` activities
  def collection_reactions
    note = fetch_resource(@status.uri, true)
    return if note.nil? || note['emojiReactions'].blank?

    items, = collection_items(note['emojiReactions'], max_pages: 2, max_items: MAX_REACTIONS, reference_uri: @status.uri)
    items
  end

  # Misskey lists reactions through `notes/reactions` and serves each of them
  # as a `Like` activity at /likes/:id
  def misskey_reactions
    match = MISSKEY_NOTE_URI.match(@status.uri)
    return if match.nil?

    reactions = Request.new(:post, "https://#{match[:host]}/api/notes/reactions", body: JSON.generate({ noteId: match[:id], limit: MAX_REACTIONS })).add_headers('Content-Type' => 'application/json').perform do |response|
      body_to_json(response.body_with_limit) if response.code == 200
    end

    as_array(reactions).filter_map do |reaction|
      next unless reaction.is_a?(Hash) && reaction['id'].present? && reaction['user'].is_a?(Hash)

      {
        'id' => "https://#{match[:host]}/likes/#{reaction['id']}",
        'type' => 'Like',
        'object' => @status.uri,
        'content' => reaction['type'].to_s.sub(/@\.:\z/, "@#{match[:host]}:"),
        'acct' => [reaction['user']['username'], reaction['user']['host'].presence || match[:host]].join('@'),
      }
    end
  rescue Mastodon::UnexpectedResponseError, HTTP::Error, OpenSSL::SSL::SSLError => e
    Rails.logger.debug { "Error fetching reactions of #{@status.uri} through the Misskey API: #{e}" }
    nil
  end

  def process_reaction(item)
    json = item.is_a?(String) ? fetch_resource(item, true) : item
    return false unless json.is_a?(Hash) && ACTIVITY_TYPES.include?(json['type']) && value_or_id(json['object']) == @status.uri

    account = reactor(json)
    return false if account.nil? || account.suspended?

    name  = Emoji.normalize((json['content'] || json['_misskey_reaction']).to_s)
    match = CUSTOM_EMOJI_REGEX.match(name)

    if match
      custom_emoji = custom_emoji_for(match[:shortcode], match[:domain] || account.domain, json)
      return false if custom_emoji.nil?

      name = custom_emoji.shortcode
    end

    return true if account.reacted?(@status, name, custom_emoji)

    @status.status_reactions.create!(account: account, name: name, custom_emoji: custom_emoji)
    true
  rescue ActiveRecord::RecordInvalid
    false
  end

  def reactor(json)
    if json['acct'].present?
      ResolveAccountService.new.call(json['acct'])
    else
      actor_uri = value_or_id(json['actor'])
      ActivityPub::TagManager.instance.uri_to_resource(actor_uri, Account) || ActivityPub::FetchRemoteAccountService.new.call(actor_uri, request_id: @request_id)
    end
  rescue Mastodon::UnexpectedResponseError, HTTP::Error, OpenSSL::SSL::SSLError, Webfinger::Error
    nil
  end

  # Like Misskey, use the emoji as already learnt from that server's posts;
  # otherwise fetch it, from the activity's `Emoji` tag or from the emoji's
  # own URI (Misskey serves them at /emojis/:name)
  def custom_emoji_for(shortcode, domain, json)
    domain = nil if domain == Rails.configuration.x.local_domain
    emoji  = CustomEmoji.find_by(shortcode: shortcode, domain: domain)
    return emoji if emoji.present? || domain.nil?

    tag = emoji_tag(json) || fetch_resource("https://#{domain}/emojis/#{shortcode}", true)
    return unless tag.is_a?(Hash) && tag['type'] == 'Emoji'

    parser = ActivityPub::Parser::CustomEmojiParser.new(tag)
    return if parser.shortcode != shortcode || parser.image_remote_url.blank?

    CustomEmoji.create!(domain: domain, shortcode: shortcode, uri: parser.uri, image_remote_url: parser.image_remote_url)
  rescue ActiveRecord::RecordInvalid, Seahorse::Client::NetworkingError => e
    Rails.logger.debug { "Error fetching custom emoji :#{shortcode}: of #{domain}: #{e}" }
    nil
  end

  # Misskey leaves the `Emoji` tag out of its API listing, but includes it in
  # the activity itself for its own emoji
  def emoji_tag(json)
    tag = as_array(json['tag']).find { |item| item['type'] == 'Emoji' }
    return tag unless tag.nil? || json['acct'].blank?

    activity = fetch_resource(json['id'], true)
    as_array(activity['tag']).find { |item| item['type'] == 'Emoji' } if activity.is_a?(Hash)
  end
end
