/**
 * Fast Streaming M3U & M3U8 Playlist Parser
 */
class PlaylistParser {
  /**
   * Fast parsing algorithm designed to avoid UI freezes on large files
   */
  static parse(m3uContent) {
    const lines = m3uContent.split(/\r?\n/);
    const channels = [];
    let currentChannel = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        currentChannel = this.parseExtInf(line);
      } else if (line.length > 0 && !line.startsWith('#')) {
        if (currentChannel) {
          currentChannel.url = line;
          currentChannel.id = this.hashCode(line);
          channels.push(currentChannel);
          currentChannel = null;
        }
      }
    }

    return channels;
  }

  static parseExtInf(headerLine) {
    const channel = {
      name: 'Unknown Channel',
      logo: '',
      group: 'Uncategorized',
      tvgId: '',
      country: ''
    };

    // Extract attributes using regular expressions
    const logoMatch = headerLine.match(/tvg-logo="([^"]*)"/i);
    const groupMatch = headerLine.match(/group-title="([^"]*)"/i);
    const idMatch = headerLine.match(/tvg-id="([^"]*)"/i);
    const countryMatch = headerLine.match(/tvg-country="([^"]*)"/i);

    if (logoMatch) channel.logo = logoMatch[1];
    if (groupMatch) channel.group = groupMatch[1] || 'Uncategorized';
    if (idMatch) channel.tvgId = idMatch[1];
    if (countryMatch) channel.country = countryMatch[1];

    // Extract Channel Name (Comma delimited at the end)
    const commaIndex = headerLine.lastIndexOf(',');
    if (commaIndex !== -1) {
      channel.name = headerLine.substring(commaIndex + 1).trim();
    }

    return channel;
  }

  static hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return 'ch_' + Math.abs(hash);
  }
}

window.PlaylistParser = PlaylistParser;
