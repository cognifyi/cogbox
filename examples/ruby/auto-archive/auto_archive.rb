# frozen_string_literal: true

require 'cogbox'

cogbox = Cogbox::Cogbox.new

# Default interval
first_sandbox = cogbox.create
puts "Default auto archive interval: #{first_sandbox.auto_archive_interval}"

# Set interval to 1 hour
first_sandbox.auto_archive_interval = 60
puts "Auto archive interval: #{first_sandbox.auto_archive_interval}"

# Max interval
second_sandbox = cogbox.create(Cogbox::CreateSandboxFromSnapshotParams.new(auto_archive_interval: 0))
puts "Max auto archive interval: #{second_sandbox.auto_archive_interval}"

# 1 day interval
third_sandbox = cogbox.create(Cogbox::CreateSandboxFromSnapshotParams.new(auto_archive_interval: 24 * 60))
puts "Auto archive interval: #{third_sandbox.auto_archive_interval}"

cogbox.delete(first_sandbox)
cogbox.delete(second_sandbox)
cogbox.delete(third_sandbox)
