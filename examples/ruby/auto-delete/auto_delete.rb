# frozen_string_literal: true

require 'cogbox'

cogbox = Cogbox::Cogbox.new

# Auto delete disabled by default
first_sandbox = cogbox.create
puts "Default auto delete interval: #{first_sandbox.auto_delete_interval}"

# Auto delete after the Sandbox has been stopped for 1 hour
first_sandbox.auto_delete_interval = 60
puts "Auto delete interval: #{first_sandbox.auto_delete_interval}"

# Delete immediately upon stopping
first_sandbox.auto_delete_interval = 0
puts "Auto delete interval: #{first_sandbox.auto_delete_interval}"

# Disable auto delete
first_sandbox.auto_delete_interval = -1
puts "Auto delete interval: #{first_sandbox.auto_delete_interval}"

# Auto delete after the Sandbox has been stopped for 1 day
second_sandbox = cogbox.create(Cogbox::CreateSandboxFromSnapshotParams.new(auto_delete_interval: 24 * 60))
puts "Auto delete interval: #{second_sandbox.auto_delete_interval}"

cogbox.delete(first_sandbox)
cogbox.delete(second_sandbox)
