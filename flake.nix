{
  description = "Jira automation - ranking de story points";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_20 ];
          shellHook = ''
            echo "Entorno Jira automation - Node $(node --version), npm $(npm --version)"
          '';
        };
      }
    );
}
