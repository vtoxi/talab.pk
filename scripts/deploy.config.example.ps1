# Copy to deploy.config.ps1 and fill in. deploy.config.ps1 is git-ignored: never commit it.

# Backend: Web Deploy (MSDeploy) to IIS
$WebDeploy = @{
  ServiceUrl = "https://your-host:8172/msdeploy.axd"
  SiteName   = "talab-api"          # IIS site name
  User       = "deploy-user"
  Password   = "..."
  AllowUntrustedCertificate = $false # true only for a self-signed server certificate
}

# Where the API answers (used to check it is ready after deploying)
$Api = @{ BaseUrl = "https://api.talab.pk" }

# Frontend: FTP
$Ftp = @{
  Url      = "ftp://your-host/site/wwwroot"
  User     = "ftp-user"
  Password = "..."
  Tls      = $true
}

# What goes into the frontend's config.json (the browser reads it at start-up)
$Frontend_ = @{
  SiteUrl         = "https://talab.pk"          # used to confirm the live site serves the new settings
  ApiUrl          = "https://api.talab.pk"      # empty if the API is on the same site as the frontend
  GoogleClientId  = "123456789-abc.apps.googleusercontent.com"
  # Map tiles: a provider or your own server. The public OpenStreetMap server is NOT allowed for real traffic.
  TileUrl         = "https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY"
  TileAttribution = "&copy; <a href='https://www.maptiler.com/copyright/'>MapTiler</a> &copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
  TileMaxZoom     = 20
}
