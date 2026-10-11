# frozen_string_literal: true

require 'cogbox'

cogbox = Cogbox::Cogbox.new

result = cogbox.snapshot.list(page: 2, limit: 10)
result.items.each do |snapshot|
  puts "#{snapshot.name} (#{snapshot.image_name})"
end
