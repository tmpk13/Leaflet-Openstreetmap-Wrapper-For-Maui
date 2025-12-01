namespace APPNAME.Resources.Components;
using System.Text.Json;
using Java.Lang;
using Org.Json;

public partial class MapView : ContentView
{

    public static readonly BindableProperty HtmlContentProperty =
        BindableProperty.Create(
            nameof(HtmlContent),
            typeof(string),
            typeof(MapView),
            string.Empty,
            propertyChanged: OnHtmlContentChanged);

    public static readonly BindableProperty DataProperty =
        BindableProperty.Create(
            nameof(Marks),
            typeof(string),
            typeof(MapView),
            string.Empty,
            propertyChanged: OnMapDataChanged);
            
    public string HtmlContent
    {
        get => (string)GetValue(HtmlContentProperty);
        set => SetValue(HtmlContentProperty, value);
    }

    public string Marks
    {
        get => (string)GetValue(DataProperty);
        set => SetValue(DataProperty, value);
    }

    private static void OnHtmlContentChanged(BindableObject bindable, object old_value, object new_value)
    {
        var control = (MapView)bindable;
        control.map_web_view.Source = new HtmlWebViewSource { Html = (string)new_value };
    }

    private static void OnMapDataChanged(BindableObject bindable, object old_value, object new_value)
    {
        var control = (MapView)bindable;
        var map_input = (string)new_value;

        var html = GenerateHtmlFromMapData(map_input);
        control.HtmlContent = html;
    }

    
    private static string GenerateHtmlFromMapData(string map_input)
    {
        JsonDocument map_json = JsonDocument.Parse(map_input);
        JsonElement root = map_json.RootElement;

        var init = root[0];
        var init_lat = (float)init[0].GetDouble();
        var init_long = (float)init[1].GetDouble();
        var init_zoom = (float)init[2].GetDouble();

        var markers = root.EnumerateArray()
            .Skip(1)
            .Where(arr => arr.GetArrayLength() > 0)
            .Select(arr => arr.EnumerateArray()
                .Select(e => (float)e.GetDouble())
                .ToArray())
            .ToArray();
        
        var map_config = new
        {
            position = new { lat = init_lat, @long = init_long, zoom = init_zoom },
            markers = markers
        };
        
        string json_string = JsonSerializer.Serialize(map_config, new JsonSerializerOptions 
        { 
            WriteIndented = false 
        });
        
        return $$"""
            <!DOCTYPE html>
            <html>
              <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/tmpk13/Leaflet-Openstreetmap-Wrapper-For-Maui@v0.0.3/Min/mapper.css">
              <script type="module">
                import { Mapper } from 'https://cdn.jsdelivr.net/gh/tmpk13/Leaflet-Openstreetmap-Wrapper-For-Maui@v0.0.3/Min/mapper.min.js';
                
                new Mapper({
                  coord: {lat: 40.7128, long: -74.0060},
                  zoom: 13,
                  marker_list: [
                    {address: "New York City"}
                  ]
                }).draw();
              </script>
            </html>
            """;
    }   

    public MapView()
    {
        InitializeComponent();
    }
}
