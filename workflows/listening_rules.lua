return {
  plan_name = "Lua Discovery Mix",
  description = "Ranks Spotify releases for a balanced first-listen queue.",
  max_items = 5,
  rules = {
    {
      key = "full_album",
      label = "Start with complete albums",
      album_type = "album",
      points = 35
    },
    {
      key = "recent_release",
      label = "Keep newer releases near the top",
      min_year = 2020,
      points = 20
    },
    {
      key = "classic_release",
      label = "Do not ignore catalog staples",
      max_year = 2009,
      points = 12
    },
    {
      key = "single_sampler",
      label = "Use singles as quick samplers",
      album_type = "single",
      points = 8
    }
  }
}
