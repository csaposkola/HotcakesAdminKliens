using System;
using System.Windows.Forms;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json.Linq;
using Hotcakes.CommerceDTO.v1.Client;
using Hotcakes.CommerceDTO.v1.Catalog;
using Hotcakes.CommerceDTO.v1;
using Hotcakes.CommerceDTO.v1.Orders;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Drawing;
using Newtonsoft.Json;
using Hotcakes.Web;
using System.IO;
using System.Threading.Tasks;




namespace Kliensapp_megvalositas
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        public static Api ApiCall()
        {
            string url = "http://rendfejl1008.northeurope.cloudapp.azure.com:8080/";
            string kulcs = "1-c3c3142f-3152-42e6-8cab-f26ee99bfb6a";
            Api proxy = new Api(url, kulcs);
            return proxy;
        }

        private async void Form1_Load(object sender, EventArgs e)
        {
            await GetProductsAsync();
        }

        private async Task GetProductsAsync()
        {
            try
            {
                Api proxy = ApiCall();

                // Aszinkron API-hívás szimulációja: Task.Run használata  
                var responseProduct = await Task.Run(() => proxy.ProductsFindAll());

                if (responseProduct == null || responseProduct.Content == null || responseProduct.Content.Count == 0)
                {
                    MessageBox.Show("Nem sikerült lekérni a termékeket vagy nincs adat.");
                    return;
                }

                listBox1.Items.Clear();
                foreach (var product in responseProduct.Content)
                {
                    if (!string.IsNullOrEmpty(product.ProductName))
                    {
                        listBox1.Items.Add(product.ProductName);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Hiba történt: {ex.Message}");
            }
        }

        private void ListBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            // Ide írhatsz további logikát, ha a felhasználó kiválaszt valamit  
        }

        private void listBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            // Itt kezelheted, ha kiválasztanak valamit a listából (pl. részletek megjelenítése)  
        }
    }
}
